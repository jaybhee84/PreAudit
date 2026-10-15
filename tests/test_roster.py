import unittest
from unittest.mock import patch
from roster import compare,normalized,candidate_score,tin_digits,month_from_path,validate_source_folders,read_payfiles
from tempfile import TemporaryDirectory
from pathlib import Path

class MatchingTests(unittest.TestCase):
    def run_comparison(self,names,roster_names,problems=None):
        records=[dict(name=n,file='pay.xlsx',sheet='Form',cell=f'F{i+23}',unit='School') for i,n in enumerate(names)]
        people=[dict(name=n,file='psipop.pdf',page=1,item=f'ITEM-{i}',position='Teacher') for i,n in enumerate(roster_names)]
        with patch('roster.scan_roster',return_value=(people,[],problems or [])),patch('roster.read_payfiles',return_value=(records,[],[])):
            return compare('pay','roster')

    def test_normalization(self):
        self.assertEqual(normalized('  Peña, Ana M. '),normalized('PENA ANA M'))

    def test_exact_variant_and_absent_are_distinct(self):
        result=self.run_comparison(['Peña, Ana Maria','CRUZ, JUAN M.','REYES, PEDRO SANTOS'],['PENA, ANA MARIA','CRUZ, JUAN MIGUEL'])
        self.assertEqual([r['status'] for r in result['results']],['Matched','Possible name variant','Separated / absent from current PSIPOP'])

    def test_incomplete_roster_blocks_separation(self):
        result=self.run_comparison(['REYES, PEDRO SANTOS'],['CRUZ, ANA MARIA'],['page failed'])
        self.assertEqual(result['results'][0]['status'],'Check roster coverage')

    def test_duplicate_roster_and_payfile_names(self):
        result=self.run_comparison(['CRUZ, ANA','CRUZ, ANA'],['CRUZ, ANA','CRUZ, ANA'])
        self.assertTrue(all(r['duplicate'] for r in result['results']))
        self.assertTrue(all(r['status']=='Multiple roster entries' for r in result['results']))

    def test_unstructured_name_requires_review(self):
        result=self.run_comparison(['ANA X CRUZ'],['REYES, PEDRO SANTOS'])
        self.assertEqual(result['results'][0]['status'],'Name format review')

    def test_different_given_names_are_not_variants(self):
        self.assertEqual(candidate_score('ZERRUDO, ARACELI FRANCISCO','ZERRUDO, ARIANE JOY FRANCISCO'),0)
        self.assertEqual(candidate_score('BARALUDDIN, NAYANG MISAH','BARALUDDIN, FAIZA MISAH'),0)
        self.assertEqual(candidate_score('BARALUDDIN, NAYANG MISAH','BARALUDDIN, SOMIA MISAH'),0)
        self.assertEqual(candidate_score('ROSALEJOS, RACHELLE MALINAO','ROSALEJOS, ROSMEN MALINAO'),0)
        self.assertEqual(candidate_score('LARRACOCHEA, KARLEZEL BONOAN','LARRACOCHEA, ARLYN GANAS'),0)
        self.assertGreater(candidate_score('GUILLERMO, SHIELA MARIE TAMPUS','GUILLERMO, SHEILA MARIE TAMPUS'),0)
        self.assertGreater(candidate_score('JUL, JEHAN SALI','JUL, JEHAN SALI I'),0)
        self.assertGreater(candidate_score('AJIJUL, MELODY CARILLO','AJILUL, MELODY CARILLO'),0)

    def test_tin_normalization_preserves_leading_zero(self):
        self.assertEqual(tin_digits('012-345-678-000'),'012345678000')
        self.assertEqual(tin_digits('000000000000'),'')
        self.assertEqual(tin_digits(12345678),'')

    def test_month_from_paths(self):
        self.assertEqual(month_from_path('12 DECEMBER2024 PSIPOP/06 ELEM.pdf'),'2024-12')
        self.assertEqual(month_from_path('01 JANUARY 2025/01 DIC JANUARY 2025 PSIPOP.pdf'),'2025-01')
        self.assertEqual(month_from_path('2024-07/file.pdf'),'2024-07')

    def test_reversed_source_folders_are_rejected(self):
        with TemporaryDirectory() as folder:
            root=Path(folder);current=root/'Current';history=root/'Previous Year';current.mkdir();history.mkdir()
            (current/'SEPTEMBER 2026 PSIPOP.pdf').touch();(history/'DECEMBER 2024 PSIPOP.pdf').touch();(history/'JANUARY 2025 PSIPOP.pdf').touch()
            validate_source_folders(str(current),str(history))
            with self.assertRaisesRegex(ValueError,'multiple months'):validate_source_folders(str(history),str(current))

    def test_zero_service_is_preserved_not_treated_as_missing(self):
        class Sheet:
            title='Form'
            values=[(None,)*11]*21+[(None,None,None,None,None,'Name of Employee','SG','Step','Months in Service in 2024','Monthly Basic Salary','Amount of the PBB'),(None,'School',None,None,None,'TEST, PERSON',11,1,0,28512,0)]
        class Book:
            def __iter__(self):return iter([Sheet()])
            def close(self):pass
        with TemporaryDirectory() as folder:
            (Path(folder)/'pay.xlsx').touch()
            with patch('roster.openpyxl.load_workbook',return_value=Book()):records,_,_=read_payfiles(folder)
            self.assertEqual(records[0]['service_months'],0)
            self.assertEqual(records[0]['payfile_pbb'],0)

    def test_unique_tin_match_and_duplicate_tin_review(self):
        pay=[dict(name='CRUZ, JUAN M',file='pay.xlsx',sheet='Form',cell='F23',unit='School')]
        roster=[dict(name='CRUZ, JUAN MIGUEL',tin='012345678000',file='pdf',page=1,item='1')]
        with patch('roster.scan_roster',return_value=(roster,[],[])),patch('roster.read_payfiles',return_value=(pay,[],[])),patch('roster.read_tin_reference',return_value=({'CRUZ JUAN M':{'012345678'}},[])):
            self.assertEqual(compare('p','r','t')['results'][0]['status'],'TIN matched')
            roster.append(dict(name='REYES, OTHER PERSON',tin='012345678000',file='pdf',page=2,item='2'))
            self.assertEqual(compare('p','r','t')['results'][0]['status'],'Multiple TIN matches')

if __name__=='__main__':unittest.main()
