import { MoreHoriz } from '@mui/icons-material';
import { Box, IconButton } from '@mui/material';

import StyledButton from '../../shared/ui/styledButton/StyledButton';

interface ISavePackage {
  classes?: string;
}

const SavePackage = (props: ISavePackage) => {
  const { classes } = props;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        border: '1px solid black',
      }}
      className={classes}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <StyledButton variant="contained">ADD</StyledButton>
        <span>file name</span>
        <IconButton>
          <MoreHoriz />
        </IconButton>
      </Box>

      <Box>пакет</Box>
    </Box>
  );
};

export default SavePackage;
